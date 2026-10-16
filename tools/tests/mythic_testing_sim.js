const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;ev('window.testRandom=Math.random');
let n=0;
const test=(name,fn)=>{ev("Math.random=window.testRandom;S=fresh();S.cls='Guillotine Cross';S.lv=150;S.zeny=1e12;S.ascensionMat=[1000,1000,1000];S.ore={ori:1000,elu:1000}");fn();n++;console.log('ok '+name)};
try{
 test('all classes and crafted weapon families are available',()=>{
  assert.equal(ev('Object.values(CLASSES).filter(c=>c.tier===4).length'),6);
  assert.ok(ev("ascensionForgePanel().includes('celestial:weapon:dagger')"));
  assert.ok(ev("ascensionForgePanel().includes('celestial:weapon:katar')"));
 });
 test('invalid crafting and full bags never consume resources',()=>{
  ev('window.wallet=JSON.stringify([S.zeny,S.ascensionMat])');
  ev("craftAscensionPiece('celestial','weapon','invalid');S.inv=Array.from({length:BAGMAX},()=>({}));ACT.craftasc('celestial:weapon:dagger')");
  assert.equal(ev('JSON.stringify([S.zeny,S.ascensionMat])===window.wallet'),true);
 });
 test('transformation preserves identity, cards and refinement',()=>{
  ev("S.eq.weapon={id:700,slot:'weapon',wt:'dagger',sec:5,r:10,aff:[{k:'crit',v:20}],cards:[{id:701}],val:100};ACT.transformasc('celestial:700')");
  assert.equal(ev('S.eq.weapon.sec'),6);assert.equal(ev('S.eq.weapon.id'),700);assert.equal(ev('S.eq.weapon.cards[0].id'),701);assert.equal(ev('S.eq.weapon.r'),10);
 });
 test('four-affix reforge survives save repair and accepts without changing identity',()=>{
  ev("S.eq.weapon=craftAscensionPiece('celestial','weapon','dagger').item;window.gearId=S.eq.weapon.id;reforge('weapon',true)");
  assert.equal(ev('validReforgeOffer(S).after.length'),4);
  ev('localStorage.setItem(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('validReforgeOffer(S).after.length'),4);
  ev('resolveReforge(true)');assert.equal(ev('S.eq.weapon.id===window.gearId'),true);assert.equal(ev('S.eq.weapon.aff.length'),4);
 });
 test('Mythic +15 uses finite ore costs; ordinary gear remains capped',()=>{
  ev("S.eq.weapon=craftAscensionPiece('celestial','weapon','dagger').item;S.eq.weapon.r=14;Math.random=()=>0;refine('weapon')");
  assert.equal(ev('S.eq.weapon.r'),15);assert.equal(ev('S.ore.ori'),985);assert.equal(ev('refCh({...S.eq.weapon,r:14})'),2);
  assert.match(ev('V.refine()'),/MAX/);ev("refine('armor')");
  ev('S.eq.weapon.sec=5;S.eq.weapon.r=10');ev("refine('weapon')");assert.equal(ev('S.eq.weapon.r'),10);
 });
 test('GM grants new resources and edits Mythic to four affixes / +15',()=>{
  ev("S.eq.weapon=craftAscensionPiece('celestial','weapon','dagger').item;gmApplyGift({resource:'ascMat2',amount:25});gmApplyGift({resource:'mythicScrolls',amount:10});gmApplyGear({mode:'affixes',itemId:S.eq.weapon.id,refine:15,aff:[{k:'str',v:10},{k:'agi',v:10},{k:'crit',v:20},{k:'cdm',v:10}]})");
  assert.equal(ev('S.mythicScrolls'),10);assert.equal(ev('S.eq.weapon.r'),15);assert.equal(ev('S.eq.weapon.aff.length'),4);
  ev('S.eq.weapon.sec=5');assert.throws(()=>ev("gmApplyGear({mode:'affixes',itemId:S.eq.weapon.id,refine:15,aff:[]})"));
 });
 test('testing grants require GM and preserve wallet when granting a set',()=>{
  ev("S.gm=false;ACT.gmset('celestial')");assert.equal(ev('S.inv.length'),0);
  ev("S.gm=true;window.wallet=JSON.stringify([S.zeny,S.ascensionMat]);ACT.gmset('celestial')");assert.equal(ev('S.inv.length'),8);assert.equal(ev('JSON.stringify([S.zeny,S.ascensionMat])===window.wallet'),true);
  assert.equal(ev('new Set(S.inv.map(it=>it.id)).size'),8);
 });
 console.log(n+' passed');
}finally{g.close()}
