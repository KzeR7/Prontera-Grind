const assert=require('node:assert/strict');const {createGame}=require('./helpers/game');const g=createGame(),ev=g.ev;
const reset=()=>ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.zeny=1e12;S.ascensionMat=[1000,1000,1000];S.auto=false;S.eq.weapon={id:9101,slot:'weapon',wt:'sword',sec:5,r:10,val:100,slots:3,cards:[{id:9102}],aff:[{k:'str',v:10},{k:'crit',v:20},{k:'cdm',v:10}],locked:true};S.inv=[];`);
let passed=0;const test=(n,fn)=>{reset();fn();console.log('ok '+n);passed++};
try{
 test('evolution replaces the owned object without another item and retains progress',()=>{ev(`window.oldItem=S.eq.weapon;window.oldCards=JSON.stringify(S.eq.weapon.cards);window.wallet=[...S.ascensionMat,S.zeny];ACT.transformasc('celestial:9101')`);assert.equal(ev('S.eq.weapon===window.oldItem'),true);assert.equal(ev('S.inv.length'),0);assert.equal(ev('S.eq.weapon.id'),9101);assert.equal(ev('S.eq.weapon.r'),10);assert.equal(ev('S.eq.weapon.locked'),true);assert.equal(ev('JSON.stringify(S.eq.weapon.cards)===window.oldCards'),true);assert.equal(ev('S.eq.weapon.aff.length'),4);assert.equal(ev('S.eq.weapon.aff[0].v'),10);assert.equal(ev('S.ascensionMat[0]'),975);assert.equal(ev('S.ascensionMat[2]'),997);assert.equal(ev('S.zeny'),1e12-100000000);ev("window.wallet=JSON.stringify([S.ascensionMat,S.zeny]);ACT.transformasc('celestial:9101')");assert.equal(ev('JSON.stringify([S.ascensionMat,S.zeny])===window.wallet'),true)});
 test('full bag evolution keeps count and source identity',()=>{ev(`S.inv=Array.from({length:BAGMAX},(_,i)=>({id:9200+i,slot:'armor',sec:5,val:100,cards:[],aff:[]}));window.source=S.inv[0];ACT.transformasc('molten:9200')`);assert.equal(ev('S.inv.length'),ev('BAGMAX'));assert.equal(ev('S.inv[0]===window.source&&S.inv[0].sec===6'),true)});
 test('fourth-job gate, stale IDs, old create action and pending reforges cannot spend',()=>{ev(`window.wallet=JSON.stringify([S.ascensionMat,S.zeny]);S.cls='Lord Knight';ACT.transformasc('celestial:9101');S.cls='Rune Knight';ACT.craftasc('celestial:weapon:sword');ACT.transformasc('celestial:999');S.reforgePending={id:9101};ACT.transformasc('celestial:9101')`);assert.equal(ev('JSON.stringify([S.ascensionMat,S.zeny])===window.wallet'),true);assert.equal(ev('S.eq.weapon.sec'),5)});
 test('candidate picker excludes incompatible weapons and requires owned N+ gear',()=>{ev(`S.inv=[{id:1,slot:'weapon',wt:'katar',sec:5},{id:2,slot:'armor',sec:4},{id:3,slot:'armor',sec:6}];window.external={id:42,slot:'armor',sec:5};window.wallet=JSON.stringify([S.ascensionMat,S.zeny]);window.result=transformToMythic(window.external,'celestial')`);assert.equal(ev('ascensionCandidates().length'),1);assert.ok(ev('window.result.error'));assert.equal(ev('JSON.stringify([S.ascensionMat,S.zeny])===window.wallet'),true)});
 test('non-fourth saves stow Mythic once and move out of Ascension fields',()=>{ev(`ACT.transformasc('celestial:9101');S.cls='Lord Knight';S.mp=10;S.lvl=3;localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);assert.equal(ev('S.eq.weapon'),null);assert.equal(ev('S.inv.filter(i=>i.id===9101).length'),1);assert.equal(ev('S.mp'),9);assert.equal(ev('gearTierOK(S.inv[0])'),false);ev(`localStorage.setItem(saveKey(),JSON.stringify(S));S=load()`);assert.equal(ev('S.inv.filter(i=>i.id===9101).length'),1)});
 test('map access requires a fourth job and ignores old level/GM shortcuts',()=>{ev(`S.cls='Lord Knight';S.gmnm=true`);assert.equal(ev('ascensionOpen(10)||ascensionOpen(11)'),false);ev(`S.cls='Rune Knight'`);assert.equal(ev('ascensionOpen(10)&&ascensionOpen(11)'),true)});
 test('Forge renders one set and owned candidates, Echo has its own tab',()=>{ev(`ascensionItemPick='9101'`);const html=ev('ascensionForgePanel()');assert.equal((html.match(/data-a="transformasc"/g)||[]).length,1);assert.equal((html.match(/data-a="craftasc"/g)||[]).length,0);assert.match(html,/data-ascension-item/);ev(`mapSeason='echo'`);assert.match(ev('V.map()'),/data-trial="lobby"/);assert.equal(ev('V.map().includes("mapgrid")'),false);ev(`mapSeason='ascension'`);assert.equal(ev('V.map().includes("data-trial=")'),false)});
 test('Forge explains each shortage and enables only with all exact costs available',()=>{
  ev(`ascensionSetPick='celestial';ascensionItemPick='9101';S.ascensionMat=[24,0,3];S.zeny=100000000`);
  const panel=()=>{const box=g.window.document.createElement('div');box.innerHTML=ev('ascensionForgePanel()');return box};
  let box=panel(),rows=box.querySelectorAll('.ascension-costs>div');
  assert.equal(rows[0].className,'ascension-missing');assert.match(rows[0].textContent,/24 \/ 25.*Missing 1/);
  assert.equal(rows[1].className,'ascension-enough');assert.equal(rows[2].className,'ascension-enough');
  assert.match(box.querySelector('[role=status]').textContent,/Unable to forge.*not enough materials or Zeny/);
  assert.equal(box.querySelector('[data-a=transformasc]').disabled,true);
  ev(`window.before=JSON.stringify([S.ascensionMat,S.zeny,S.eq]);ACT.transformasc('celestial:9101')`);
  assert.equal(ev('JSON.stringify([S.ascensionMat,S.zeny,S.eq])===window.before'),true,'blocked forging spends nothing');
  ev('S.ascensionMat=[25,0,2]');box=panel();assert.equal(box.querySelectorAll('.ascension-missing').length,2);
  assert.match(box.querySelectorAll('.ascension-costs>div')[1].textContent,/Missing 1/);
  ev('S.ascensionMat=[25,0,3];S.zeny=99999999');box=panel();
  assert.equal(box.querySelectorAll('.ascension-costs>div')[2].className,'ascension-missing');
  ev('S.zeny=100000000');box=panel();assert.equal(box.querySelector('[data-a=transformasc]').disabled,false);
  assert.equal(box.querySelectorAll('.ascension-costs>.ascension-enough').length,3);
  assert.match(box.querySelector('[role=status]').textContent,/Ready to forge/);
  ev(`ascensionSetPick='molten';S.ascensionMat=[1000,31,3];S.zeny=130000000`);box=panel();
  assert.match(box.querySelector('.ascension-costs .ascension-missing').textContent,/Primal Catalyst.*Missing 1/);
  ev(`ascensionItemPick=''`);box=panel();assert.equal(box.querySelector('.ascension-costs'),null);
 });
 console.log(passed+' evolution checks passed');
}finally{g.close()}
