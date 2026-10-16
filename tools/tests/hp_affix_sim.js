// Effective HP conversion: raw/save/roll/filter identity and shared stat/UI consumers.
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 for(const [sec,tier]of [[0,0],[0,1],[0,2],[0,3],[0,4],[4,4],[5,4],[6,4]]){
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.eq.head=${sec===6?"makeMythicEquipment('celestial','head').item":`genGear({k:'head',n:'HP conversion'},150,${sec},false,${tier},9,10)`};S.eq.head.aff=[];window.beforeHp=maxHp();S.eq.head.aff=[{k:'hp',v:100},{k:'luk',v:80},{k:'crit',v:40}];`);
  assert.equal(ev("bon('hp')"),200,`grade ${sec}/${tier} effective HP`);
  assert.equal(ev("bon('luk')"),80,'LUK retains x1');assert.equal(ev("bon('crit')"),40,'Crit retains x1');
  assert.equal(ev('maxHp()-beforeHp'),390,'200 base HP uses Rune Knight HP multiplier 1.95');
  assert.equal(ev("S.eq.head.aff[0].v"),100,'raw roll preserved');
  assert.match(ev('itemDetail(S.eq.head)'),/Max HP \+200 \(roll \+100 ×2\)/);
  assert.match(ev('eclipseItemSummary(S.eq.head,false)'),/Max HP \+200 \(roll \+100 ×2\)/);
  assert.match(ev('affixRangeText(S.eq.head.aff[0],S.eq.head)'),/effective\]/,'reforge ranges identify effective HP');
  ev('window.rawAffixes=JSON.stringify(S.eq.head.aff);lsPut(saveKey(),JSON.stringify(S));S=load()');
  assert.equal(ev('JSON.stringify(S.eq.head.aff)'),ev('rawAffixes'),'reload does not rewrite rolls');
  assert.equal(ev("bon('hp')"),200,'reload does not compound conversion');
 }
 // HP from cards remains separate, including old flat-HP card saves.
 ev("S=fresh();S.cls='Rune Knight';S.lv=150;S.eq.armor={id:301,slot:'armor',sec:3,tier:4,val:0,aff:[{k:'hp',v:100}],cards:[{card:1,stat:'hp',v:30,g:0}]};");
 assert.equal(ev("cardEffects(S.eq.armor.cards[0])[0].v"),30);
 assert.equal(ev("bon('hp')"),230,'double gear affix plus unchanged card HP');
 // Off-hand daggers apply their normal half contribution after HP conversion.
 ev("S.cls='Guillotine Cross';S.eq={off:{id:302,slot:'weapon',wt:'dagger',sec:6,val:0,aff:[{k:'hp',v:100},{k:'crit',v:40},{k:'luk',v:80}],cards:[]}};");
 assert.equal(ev("bon('hp')"),100);assert.equal(ev("bon('crit')"),20);assert.equal(ev("bon('luk')"),40);
 assert.equal(ev('mythicCrit()'),20,'direct Mythic crit retains its existing half-weighted value');
 // A preexisting raw-value sell filter must keep its semantics after the stat buff.
 ev("S=fresh();S.autoSell=RARALL.map(()=>true);S.autoSellRules={...defaultAutoSellRules(),affixes:[{k:'hp',min:150}],affixAction:'keep'};window.filterItem={id:303,slot:'armor',name:'Filter fixture',tier:0,sec:0,r:0,aff:[{k:'hp',v:100}],cards:[],slots:0};");
 assert.equal(ev('autoSellReason(filterItem)'),'', 'effective +200 does not alter saved raw minimum 150');
 ev('S.autoSellRules.affixes[0].min=100');assert.equal(ev('autoSellReason(filterItem)'),'Keep affixes');
 assert.match(ev('autoSellEditor()'),/minimums use stored roll values/);
 // Paid offers retain raw HP and display the effective value on both sides after reload.
 ev("S=fresh();S.cls='Rune Knight';S.lv=150;S.zeny=1e12;S.eq.head=makeMythicEquipment('celestial','head').item;S.eq.head.aff=[{k:'hp',v:100}];Math.random=()=>.6;reforge('head',true);window.paid=JSON.stringify(S.reforgePending);lsPut(saveKey(),JSON.stringify(S));S=load()");
 assert.equal(ev('JSON.stringify(S.reforgePending)'),ev('paid'));
 assert.match(ev('reforgePanel()'),/Max HP \+200 \(roll \+100 ×2\)/);
 console.log('PASS: all eight grades, HP x2 / Crit-LUK x1, actual max HP, raw save identity, card/offhand boundaries, item/reforge UI and unchanged saved sell-filter units.');
}finally{g.close()}
