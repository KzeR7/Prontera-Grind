const assert=require('node:assert/strict'),fs=require('node:fs');
const {createGame}=require('./helpers/game');const g=createGame(),ev=g.ev,doc=g.window.document;let passed=0;
function test(name,fn){fn();passed++;console.log('ok '+name)}
function fresh(){ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.adv=false;S.auto=false;S.prog[10]=5;S.mp=10;S.lvl=1;astralJourney=null;astralOriginStage=1;pl.x=3;pl.z=-8;ct.z=-8;ascensionRoot=new THREE.Group();S.zeny=1e12;S.ore={ori:1000,elu:1000};S.nmMat=[0];`)}
try{
 test('all 20 Astral stage changes finish in two seconds and preserve continuous arrival',()=>{
  for(let from=1;from<=5;from++)for(let to=1;to<=5;to++)if(from!==to){fresh();ev(`petR.travelTest={x:2,z:-6.7,face:0,run:false};S.lvl=${from};astralOriginStage=${from};gotoField(10,${to});window.originX=pl.x;window.originZ=pl.z;`);ev('tickAstralJourney(1.95)');assert.ok(ev('Math.hypot(petR.travelTest.x-pl.x,petR.travelTest.z-pl.z)<4'),'pet keeps pace with accelerated travel');assert.ok(ev('!!astralJourney'),'not before two seconds');assert.ok(ev('pl.z!==originZ'),'walk is visible');ev('tickAstralJourney(.05)');assert.equal(ev('astralJourney'),null);assert.equal(ev('astralOriginStage'),to);assert.ok(Math.abs(ev('pl.z')-ev('Z1-5'))<1e-7);assert.ok(Math.abs(ev('pl.x'))<1e-7);}
 });
 test('old ten/five material saves consolidate quantities once; new wallet reloads unchanged',()=>{
  for(const version of [undefined,2,3]){fresh();const a=version===3?[55]:version===2?[3,7,11,15,19]:[1,2,3,4,5,6,7,8,9,10];ev(`S.nmMat=${JSON.stringify(a)};${version===undefined?'delete S.nmMatVersion':`S.nmMatVersion=${version}`};lsPut(saveKey(),JSON.stringify(S));S=load()`);assert.equal(ev('S.nmMat.join()'),'55');assert.equal(ev('S.nmMatVersion'),3);ev('lsPut(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.nmMat.join()'),'55');}
  assert.deepEqual(Array.from(ev('NM_MAT')),['Void Core']);for(let m=0;m<10;m++){assert.equal(ev(`fieldOf(${m},15).boss.mat.m`),0);assert.equal(ev(`fieldOf(${m},15).boss.mat.n`),'Void Core');}
 });
 test('legacy GM resources, crafting, purchases and selective reforge share Void Core',()=>{
  fresh();ev(`S.nmMat=[0];gmApplyGift({resource:'nm9',amount:2});gmApplyGift({resource:'nmat4',amount:3});gmApplyGift({resource:'nmat0',amount:20});craftDps()`);assert.equal(ev('S.nmMat.join()'),'5');assert.equal(ev('S.refineScrolls'),1);ev('buyMat(0)');assert.equal(ev('S.nmMat[0]'),6);
  ev(`S.eq.weapon={id:71,slot:'weapon',wt:'sword',r:0,sec:5,tier:4,mp:9,val:100,aff:[{k:'str',v:1},{k:'agi',v:1}],cards:[]};reforgeSelection[71]=[0];reforge('weapon')`);assert.equal(ev('S.nmMat[0]'),2);assert.ok(ev('!!S.reforgePending'));ev(`resolveReforge(false)`);assert.equal(ev('S.nmMat[0]'),2);
 });
 test('unprotected +5 through +9 fails lose a rank on every grade; low ranks and Mythic +10 stay safe',()=>{
  fresh();ev('S.useRefineScroll=false;window.rand=Math.random;Math.random=()=>.999');
  try{for(const sec of [0,4,5,6])for(let rank=4;rank<=9;rank++){ev(`S.eq.weapon={id:1,slot:'weapon',wt:'sword',sec:${sec},tier:4,r:${rank},val:100,aff:[],cards:[]};refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),rank>=5?rank-1:rank,`grade ${sec} rank ${rank}`)}ev(`S.eq.weapon.sec=6;S.eq.weapon.r=10;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),10);ev(`S.eq.weapon.r=11;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),10);ev(`S.eq.weapon.r=8;S.useRefineScroll=true;S.refineScrolls=1;refine('weapon')`);assert.equal(ev('S.eq.weapon.r'),8);assert.equal(ev('S.refineScrolls'),0);}finally{ev('Math.random=rand')}
 });
 test('Skills opens with the combo editor and migrates old combo navigation',()=>{
  fresh();ev(`S.sk.bash=1;S.jobs.Swordman={jl:40,jx:0};tabs.splice(0,tabs.length,'skills');sub.skills='combo';renderWin()`);assert.equal(ev('sub.skills'),'skilllist');assert.equal(doc.querySelectorAll('[data-combo-slot]').length,6);assert.equal(doc.querySelector('[data-v="skills:combo"]'),null);assert.equal(doc.querySelector('.ui-content').firstElementChild.className,'ui-combo-editor');assert.equal(doc.querySelector('[data-fold="combo-setup"]'),null);
 });
 test('current lineage has five actionable class cards; full tree retains all classes',()=>{
  fresh();ev(`S.cls='Assassin Cross';tabs.splice(0,tabs.length,'job');eclipseJobsBrowse=false;renderWin()`);assert.deepEqual([...doc.querySelectorAll('.current-class-card')].map(x=>x.dataset.v),['Novice','Thief','Assassin','Assassin Cross','Guillotine Cross']);assert.ok(doc.querySelector('.current-class-card[data-v="Assassin Cross"]').disabled);doc.querySelector('[data-a=jobview][data-v=browse]').click();assert.equal(doc.querySelectorAll('.class-lineage-overview .tn').length,25);assert.equal(doc.querySelector('.class-path-tabs'),null);ev(`S.cls='Guillotine Cross';S.jobs['Assassin Cross']={jl:50,jx:0};S.mp=0;S.lvl=1;eclipseJobsBrowse=false;renderWin()`);const back=doc.querySelector('.current-class-card[data-v="Assassin Cross"]');assert.equal(back.disabled,false);back.click();assert.equal(ev('S.cls'),'Assassin Cross','large card changes to the played class');
 });
 test('Endless Echo map destination includes a dedicated illustrated scene',()=>{
  fresh();ev(`tabs.splice(0,tabs.length,'map');mapSeason='echo';renderWin()`);assert.ok(doc.querySelector('.echo-scene[role=img]'));assert.ok(doc.querySelector('[data-trial=lobby]'));assert.ok(fs.existsSync(__dirname+'/../../assets/atlas/endless-echo.svg'));
 });
 console.log(`${passed} progression refresh groups passed`);
}finally{g.close()}
