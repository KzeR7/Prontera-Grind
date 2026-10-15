// Live five-stage route, material-only rewards, and one-time ten-stage save migration.
'use strict';
const assert=require('assert/strict'),{createGame}=require('./helpers/game');
const game=createGame(),{ev}=game;
try{
 ev("currentUser='ascension_migration';S=fresh();S.lv=150;S.mapClears[9]=true;S.mapClears[10]=true;S.auto=false;S.adv=false;");
 for(const m of [10,11])for(let l=1;l<=5;l++){
  ev(`S.mp=${m};S.lvl=${l};S.prog[${m}]=5;spawn()`);
  assert.equal(ev(`fieldOf(${m},${l}).boss!==null`),l===5);
  assert.equal(ev('isBoss()'),l===5);
  assert.equal(ev(`gearPool(${m},${l}).length`),0);
  assert.equal(ev('mobs.every(x=>x.drops.length===0)'),true);
  assert.equal(ev('mobs.filter(x=>x.boss).length'),l===5?1:0);
  assert.equal(ev(`canTravel(${m},6)`),false);
  assert.throws(()=>ev(`fieldOf(${m},6)`),/five stages/);
 }
 // Online and away kills both pay materials without equipment, even with every die winning.
 ev('window.savedRandom=Math.random;Math.random=()=>0;S.mp=10;S.lvl=5;spawn();window.beforeInv=S.inv.length;kill(mobs.find(x=>x.boss));');
 assert.equal(ev('S.mapClears[10]'),true);
 assert.equal(ev('S.inv.length===window.beforeInv'),true);
 assert.equal(ev('drops.some(x=>x.it?.slot)'),false);
 assert.equal(ev('drops.filter(x=>x.it?.ascMat!=null).length'),2);
 ev(`window.away={measured:true,kills:0,drops:0,cards:0,ori:0,elu:0,items:0,pets:0,petFolds:0,petRefunds:0,zeny:0,exp:0};
  S.mp=11;S.lvl=5;offlineAwardKill(offlineMobForCurrentField(11,5),window.away);`);
 assert.equal(ev('S.ascensionMat[1]'),1);assert.equal(ev('S.ascensionMat[2]'),1);
 assert.equal(ev('window.away.items'),0);assert.equal(ev('S.mapClears[11]'),true);
 ev('Math.random=window.savedRandom');
 // Stage 4 opens stage 5; auto-advance cannot create stage 6 on the final map.
 ev('S.adv=true;S.mp=11;S.lvl=4;S.prog[11]=4;S.kl=MPS-1;spawn();kill(mobs[0])');
 assert.equal(ev('S.lvl'),5);assert.equal(ev('S.prog[11]'),5);
 ev('spawn();kill(mobs.find(x=>x.boss))');assert.equal(ev('S.mp'),11);assert.equal(ev('S.lvl'),5);
 // Migration is based on the saved version, never on the defaults merged during load.
 const expected=[1,2,2,3,3,3,4,4,4,5];
 for(const m of [10,11])for(let old=1;old<=10;old++){
  ev(`S=fresh();S.lv=150;S.mapClears[9]=true;S.mapClears[10]=true;S.mp=${m};S.lvl=${old};S.prog[${m}]=${old};S.ascensionMat=[3,4,5];
   S.offlineIncome={version:1,key:'Novice:${m}:${old}',at:1,xp:3,zeny:4,job:2,kph:60};delete S.ascensionStageVersion;
   lsPut(saveKey(),JSON.stringify(S));S=load();`);
  assert.equal(ev('S.lvl'),expected[old-1]);assert.equal(ev(`S.prog[${m}]`),expected[old-1]);
  assert.equal(ev('S.offlineIncome.key'),`Novice:${m}:${expected[old-1]}`);
  assert.equal(ev('S.mapClears[10]'),true);assert.equal(ev('S.ascensionMat.join()'),'3,4,5');
  ev('lsPut(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.lvl'),expected[old-1]);
 }
 ev("S.prog[11]=5;S.mp=11;S.lvl=5;mapM=11;mapL=5;mapSeason='ascension';");
 const html=ev('V.map()');assert.match(html,/5\/5 stages available/);assert.doesNotMatch(html,/Gear chance per kill|Every MVP drop is/);
 assert.match(html,/N\+ weapon evolution/);assert.match(html,/Ascension skill/);
 console.log('PASS: ten fields, boss5/escorts, no equipment online/offline, stage4→5, capped final route, twenty legacy migrations/idempotence, material UI.');
}finally{game.close();}

// Access, save repair and balance use the real online spawn path.
const balance=createGame();
try{
 const {ev}=balance;
 ev('S=fresh();S.auto=false;S.adv=false;S.lv=149;S.mapClears.fill(true)');
 for(const m of [10,11])assert.equal(ev(`canTravel(${m},1)`),false);
 ev('S.lv=150;S.mapClears.fill(false)');
 for(const m of [10,11]){
  assert.equal(ev(`canTravel(${m},1)`),true);
  assert.equal(ev(`canTravel(${m},2)`),false); // Stages still earn their normal progress.
  ev(`S.mp=${m};S.lvl=1;currentUser='ascension-access';lsPut(saveKey(),JSON.stringify(S));S=load()`);
  assert.equal(ev('S.mp'),m);assert.equal(ev('S.lvl'),1);
 }
 ev('S.mp=9;S.lvl=15;spawn();window.abyss=mobs.find(x=>x.boss)');
 const abyss=ev('({hp:window.abyss.hp,atk:window.abyss.atk})');
 for(const m of [10,11]){
  let previous=0;
  for(let stage=1;stage<=5;stage++){
   ev(`S.mp=${m};S.lvl=${stage};spawn()`);
   const regular=ev('mobs.find(x=>!x.boss)');
   assert.ok(regular.hp>previous);previous=regular.hp;
   if(stage===1){
    assert.equal(regular.hp,Math.floor(abyss.hp*1.3));
    assert.equal(regular.atk,Math.floor(abyss.atk*1.3));
    console.log(`${ev('MAPS[S.mp].n')} entry: ${regular.hp} HP, ${regular.atk} ATK; ${(regular.hp/32000000).toFixed(2)}s at 32M DPS (HP only).`);
   }
   if(stage===5){
    const boss=ev('mobs.find(x=>x.boss)');
    assert.ok(Math.abs(boss.hp-regular.hp*4)<=4);
    assert.ok(Math.abs(boss.atk-regular.atk*4)<=4);
   }
  }
 }
 ev('S.lv=149;S.mp=11;lsPut(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.mp'),9);
 console.log('PASS: independent Lv150 access without clears, reload/locked-save repair, both five-stage HP/ATK ramps and MVP scaling.');
}finally{balance.close();}
