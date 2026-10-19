// Real manual, saved-loadout and persistence paths; preserve item/card identity.
'use strict';
const assert=require('node:assert/strict'),{createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
function setup(cls){ev(`S=fresh();S.cls=${JSON.stringify(cls)};S.lv=150;S.auto=false;S.adv=false;currentUser='assassin-equipment';
 window.blade=(id,wt)=>({id,slot:'weapon',wt,name:wt,val:100,r:2,sec:2,tier:3,aff:[{k:'str',v:6}],cards:[],slots:3});
 S.eq.weapon=blade(1,'dagger');S.eq.off=blade(2,'dagger');S.eq.off.cards=[{id:202,stat:'atk',v:8,g:1,cardVersion:1}];S.inv=[blade(3,'katar'),blade(4,'dagger')];`)}
function preserved(){
 assert.equal(ev('S.eq.off'),null);
 assert.equal(ev('items().concat(S.inv).map(it=>it.id).sort().join()'),'1,2,3,4');
 assert.equal(ev('S.inv.find(it=>it.id===2).cards[0].id'),202);
 assert.equal(ev('items().concat(S.inv).flatMap(it=>it.cards||[]).filter(c=>c.id===202).length'),1);
}
try{
 for(const cls of ['Assassin','Assassin Cross','Guillotine Cross']){
  for(const method of ['bag','slot']){
   setup(cls);ev(method==='bag'?'equip(3)':"equipIn('weapon',3)");
   assert.equal(ev('S.eq.weapon.wt'),'katar');preserved();
   assert.equal(ev("slotAccepts('off',S.inv.find(it=>it.id===4))"),false);
   ev("equipIn('off',4)");preserved();
   ev('snapClass();window.ids=S.base[S.cls].eq;equipRec(ids)');preserved();
   // Save/reload preserves the same items and permits returning to legal dual daggers.
   ev('lsPut(saveKey(),JSON.stringify(S));S=load()');preserved();
   ev("equipIn('weapon',1);equipIn('off',2)");
   assert.equal(ev('S.eq.weapon.id'),1);assert.equal(ev('S.eq.off.id'),2);
   ev('lsPut(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.eq.off.id'),2);
   assert.equal(ev("eqv('weapon')"),130,'main-hand refined value stays full');
   assert.equal(ev("eqv('off')"),45.5,'off-hand refined value uses 35% after reload');
   assert.ok(Math.abs(ev("bon('str')")-8.1)<1e-9,'both affixes keep main full / off 35%');
   assert.equal(ev("bon('atk')"),2.8,'off-hand card uses 35% after reload');
   assert.equal(ev('S.eq.off.aff[0].v'),6,'saved affix roll unchanged');
   assert.equal(ev('S.eq.off.cards[0].v'),8,'saved card value unchanged');
  }
  setup(cls);ev("S.inv.push(S.eq.weapon);S.eq.weapon=S.inv.splice(S.inv.findIndex(it=>it.id===3),1)[0];equipRec({off:2,weapon:3})");preserved();
  setup(cls);ev("S.inv.push(S.eq.weapon);S.eq.weapon=S.inv.splice(S.inv.findIndex(it=>it.id===3),1)[0];stowUnfit(null)");preserved();
  for(const method of ['bag','slot']){
   setup(cls);ev("while(S.inv.length<BAGMAX)S.inv.push({...blade(1000+S.inv.length,'dagger'),cards:[]});window.before=JSON.stringify([S.eq,S.inv])");
   ev(method==='bag'?'equip(3)':"equipIn('weapon',3)");assert.equal(ev('JSON.stringify([S.eq,S.inv])===before'),true);
  }
 }
 console.log('PASS: all three Assassin jobs, both manual equip routes, blocked mixed weapons, restore/load repair, card/item preservation, legal dagger persistence, 35% stats with unchanged saved rolls, and full-bag atomicity.');
}finally{g.close()}
