// Real game handlers and DOM: Eclipse changes presentation, not rewards or transactions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createGame}=require('./helpers/game');
const root=path.resolve(__dirname,'../..');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('</body>','<script>window.eclipseRealUI=ui;window.eclipseRealSave=save;window.eclipseRealBars=bars;window.eclipseInitialQuestOpen=qOpen;</script></body>');
const g=createGame(html),doc=g.window.document,ev=g.ev;let passed=0;
const test=(name,fn)=>{ev(`S=fresh();S.auto=false;S.lv=150;S.zeny=1e9;S.ore.ori=1000;S.ore.elu=1000;currentUser='eclipse-test';tabs.length=0;sub.equip='equip0';sub.bag='bag';sub.market='supplies';eclipseInventoryState=null;eclipseSearch='';eclipseRarity=-1;eclipseInspectBag=false;qOpen=true;eqPick=null;selE='weapon';selB=null;ui=window.eclipseRealUI;save=window.eclipseRealSave;`);fn();console.log('ok '+name);passed++};
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
 ev(`S.inv=[{...S.eq.weapon,id:42001,name:'First item'},{...S.eq.weapon,id:42001,name:'Second item'}];tabs.push('bag');renderWin()`);
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
 assert.equal(doc.querySelectorAll('#dock > [data-t]').length,10);assert.equal(doc.querySelector('#dock [data-t=index]'),null);doc.querySelector('#dock .eclipse-more').click();assert.ok(doc.getElementById('sideMenu').classList.contains('eclipse-more-open'));assert.ok(doc.querySelector('#sideLinks [data-t=index]'));
 ev('qOpen=true;eclipseQuestAll=false;renderQ()');assert.equal(doc.querySelectorAll('#qp .quest-entry').length,3);doc.querySelector('[data-q=viewall]').click();assert.ok(doc.querySelectorAll('#qp .quest-entry').length>3);
});
test('card collection tiles expose names and retain keyboard selection',()=>{
 ev(`S.cards=CARD_CATALOG.slice(0,2).map(c=>newCard(c));tabs.push('bag');sub.bag='cards';renderWin()`);
 const tile=doc.querySelector('.eclipse-card-grid [data-a=selc]');assert.match(tile.textContent,/Poring/);tile.dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.ok(doc.querySelector('[data-win=bag] .ui-inspector').textContent.includes('Poring'));
});
test('class overview opens all lineages and keeps selection separate from switching',()=>{
 ev(`S.cls='Lord Knight';eclipseJobsBrowse=false;tabs.push('job');renderWin()`);
 assert.equal(doc.querySelector('.eclipse-class-overview').hidden,false);assert.equal(doc.querySelectorAll('.eclipse-class-node').length,4);
 const before=ev('JSON.stringify(S)');doc.querySelector('[data-a=jobview][data-v=browse]').click();assert.equal(doc.querySelector('.eclipse-class-browser').hidden,false);
 assert.equal(doc.querySelectorAll('.eclipse-class-browser [data-a=selk]').length,19);
 doc.querySelector('.eclipse-class-browser [data-a=selk][data-v=Wizard]').click();assert.equal(ev('selK'),'Wizard');assert.equal(ev('JSON.stringify(S)'),before);
 assert.ok(doc.querySelector('[data-a=job][data-v=Wizard]').disabled);doc.querySelector('[data-a=jobview][data-v=overview]').click();assert.equal(doc.querySelector('.eclipse-class-overview').hidden,false);
});
test('pet cards preserve training, skills and deployment controls',()=>{
 ev(`S.pets=[{id:91001,sp:0,mut:0,eq:[0,1,2],skills:[],on:true},{id:91002,sp:1,mut:0,eq:[0,0,0],skills:[],on:false}];selP=null;sub.pet='party';tabs.push('pet');renderWin()`);
 assert.equal(doc.querySelectorAll('.eclipse-companion-card:not([hidden])').length,3);assert.match(doc.querySelector('.eclipse-companion-card').textContent,/3 \/ 15/);
 const before=ev('JSON.stringify(S)');doc.querySelector('[data-v="pet:collection"]').click();assert.equal(doc.querySelectorAll('.eclipse-companion-card:not([hidden])').length,2);
 doc.querySelector('[data-a=selp][data-v="91002"]').dispatchEvent(new g.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(ev('sub.pet'),'manage');assert.equal(ev('selP'),91002);assert.equal(ev('JSON.stringify(S)'),before);
 for(const a of ['peq','pskill','pon','prel','proll','pauto','psk'])assert.ok(doc.querySelector('.ui-inspector [data-a='+a+']'),a);
 doc.querySelector('[data-a=pon]').click();assert.equal(ev('gp(91002).on'),true);doc.querySelector('[data-v="pet:party"]').click();assert.match(doc.querySelector('.eclipse-pet-tabs').textContent,/2 \/ 3/);
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
 assert.equal(doc.querySelectorAll('.eclipse-stages:not(.eclipse-nightmare) button').length,10);assert.equal(doc.querySelectorAll('.eclipse-nightmare button').length,5);assert.ok(doc.querySelector('.ui-route [data-trial=lobby]'));
});
test('refine feedback follows success, safe failure, protection and rank loss',()=>{
 ev(`tabs.push('equip');sub.equip='refine';window.refineRandom=Math.random;window.refineRolls=0;Math.random=()=>{window.refineRolls++;return 0};S.eq.weapon.r=5;S.useRefineScroll=false;S.dps=0;renderWin()`);
 const ore=ev('S.ore.ori'),cost=ev('refCost(S.eq.weapon)'),need=ev('refOre(S.eq.weapon)'),zeny=ev('S.zeny');doc.querySelector('[data-a=refine]').click();
 assert.equal(ev('S.eq.weapon.r'),6);assert.equal(ev('S.ore.ori'),ore-need);assert.equal(ev('S.zeny'),zeny-cost);assert.equal(ev('window.refineRolls'),1);assert.ok(doc.getElementById('eclipseRefineResult').classList.contains('refine-success'));assert.match(doc.getElementById('eclipseRefineResult').textContent,/\+5 → \+6/);
 ev(`Math.random=()=>.999;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),5);assert.ok(doc.getElementById('eclipseRefineResult').classList.contains('refine-failure'));assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank reduced/);
 ev(`S.useRefineScroll=true;S.refineScrollFrom=5;S.refineScrolls=1;S.dps=1;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),5);assert.equal(ev('S.refineScrolls'),0);assert.equal(ev('S.dps'),1);assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank kept at \+5/);
 ev(`S.useRefineScroll=false;refine('weapon')`);assert.equal(ev('S.dps'),0);assert.equal(ev('S.eq.weapon.r'),5);
 ev(`S.eq.weapon.r=3;refine('weapon')`);assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank kept at \+3/);
 ev(`clearTimeout(eclipseRefineTimer);$('eclipseRefineResult').hidden=true;S.zeny=0;refine('weapon');Math.random=window.refineRandom`);assert.equal(doc.getElementById('eclipseRefineResult').hidden,true);
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
 ev("tabs.push('market');renderWin()");assert.deepEqual([...doc.querySelectorAll('.eclipse-product-copy>b')].map(e=>e.textContent),['Oridecon','Elunium','Refine Scroll','Echo store']);assert.match(doc.querySelector('.eclipse-product').textContent,/Owned: 1,000/);
});
test('a confirmed below-five failure consumes one scroll and keeps the rank',()=>{
 ev(`S.eq.weapon.r=2;S.useRefineScroll=true;S.refineScrolls=2;refine('weapon');window.oldRefRandom=Math.random;Math.random=()=>.999`);doc.getElementById('my').click();ev('Math.random=window.oldRefRandom');assert.equal(ev('S.eq.weapon.r'),2);assert.equal(ev('S.refineScrolls'),1);assert.match(doc.getElementById('eclipseRefineResult').textContent,/Rank kept at \+2/);
});
test('class path shows the current collection bonus in both views',()=>{
 ev("S.cls='Lord Knight';S.lv=100;S.base={'High Wizard':{lv:100}};eclipseJobsBrowse=false;tabs.push('job');renderWin()");
 assert.equal(ev('collDmg()'),2);assert.equal(doc.querySelectorAll('.eclipse-class-bonus').length,2);
 for(const node of doc.querySelectorAll('.eclipse-class-bonus')){assert.match(node.textContent,/\+2% damage/);assert.match(node.textContent,/permanent \+1%/);assert.match(node.textContent,/Base Lv 100/)}
 doc.querySelector('[data-a=jobview][data-v=browse]').click();assert.equal(doc.querySelector('.eclipse-class-browser').hidden,false);
 ev("S.base['High Wizard'].lv=99;renderWin()");assert.match(doc.querySelector('.eclipse-class-browser .eclipse-class-bonus').textContent,/\+1% damage/);
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
