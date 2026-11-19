// Live five-stage route, weapon-only N+ Ascension drops, materials and one-time save migration.
'use strict';
const assert=require('assert/strict'),{createGame}=require('./helpers/game');
const game=createGame(),{ev}=game;
try{
 ev("currentUser='ascension_migration';S=fresh();S.cls='Rune Knight';S.lv=150;S.mapClears[9]=true;S.mapClears[10]=true;S.auto=false;S.adv=false;");
 for(const m of [10,11])for(let l=1;l<=5;l++){
  ev(`S.mp=${m};S.lvl=${l};S.prog[${m}]=5;spawn()`);
  assert.equal(ev(`fieldOf(${m},${l}).boss!==null`),l===5);
  assert.equal(ev('isBoss()'),l===5);
  // Both maps drop only their new section-5 N+ weapons: seven new weapon families, no armor or repeated nightmare weapons.
  // N weapons and equipment remain on Nightmare maps; section-6 Mythics are Forge-only.
  assert.equal(ev(`gearPool(${m},${l}).length`),7,`map ${m} stage ${l}: seven new N+ weapons only`);
  assert.equal(ev(`gearPool(${m},${l}).every(x=>x.sec===5&&!['armor','head','off','leg','acc'].includes(x.k))`),true,'N+ weapon-only drop shelf');
  assert.equal(ev("mobs.filter(x=>!x.boss).every(x=>x.drops.length===7&&x.drops.every(([T,ch])=>T.sec===5&&ch===0.08&&!['armor','head','off','leg','acc'].includes(T.k)))"),true,'regular enemies drop N+ weapons only at 0.08%');
  assert.equal(ev(`mobs.filter(x=>x.boss).every(x=>x.drops.length===gearPool(${m},${l}).length&&x.drops.every(([,ch])=>ch===0.11))`),true,'the MVP lists the whole weapon shelf at 0.11%');
  assert.equal(ev('mobs.filter(x=>x.boss).length'),l===5?1:0);
  assert.equal(ev(`canTravel(${m},6)`),false);
  assert.throws(()=>ev(`fieldOf(${m},6)`),/five stages/);
 }
 // haven-v417: Ascension fields used to be materials-only. They now drop equipment too, so the
 // guarantee under test changed from "no equipment ever" to "materials are still always paid, and
 // any equipment that lands is a real, wearable piece from the map's own shelf".
 ev('window.savedRandom=Math.random;Math.random=()=>0;S.mp=10;S.lvl=5;spawn();window.beforeInv=S.inv.length;kill(mobs.find(x=>x.boss));');
 assert.equal(ev('S.mapClears[10]'),true);
 assert.equal(ev('drops.filter(x=>x.it?.ascMat!=null).length'),2,'the MVP still always pays its two Ascension materials');
 // with every die winning, the MVP pays gear as well - and it is the Astral shelf, on the right section
 const gained=ev('drops.filter(x=>x.it?.slot).map(x=>x.it.wt||x.it.slot)');
 assert.ok(gained.length>0,'the Stage 5 MVP now pays equipment');
 const allowed=ev(`(()=>{const p=gearPool(10,5);return p.map(x=>x.k)})()`);
 gained.forEach(k=>assert.ok(allowed.includes(k),'a dropped piece must come from the Astral Citadel shelf, got '+k));
 assert.equal(ev("drops.every(x=>!x.it?.slot||x.it.sec===5&&x.it.slot==='weapon')"),true,'Astral equipment drops are section-5 N+ weapons only');
 ev('S.inv.length=window.beforeInv;');
 ev(`window.away={measured:true,kills:0,drops:0,cards:0,ori:0,elu:0,items:0,pets:0,petFolds:0,petRefunds:0,zeny:0,exp:0};
  S.mp=11;S.lvl=5;offlineAwardKill(offlineMobForCurrentField(11,5),window.away);`);
 assert.equal(ev('S.ascensionMat[1]'),1);assert.equal(ev('S.ascensionMat[2]'),1);
 // Away kills now pay equipment on Ascension too (haven-v417); the materials must still arrive.
 assert.ok(ev('window.away.items')>0,'away kills on Thor Volcano now pay equipment as well');
 assert.equal(ev('S.ascensionMat[1]')>=1&&ev('S.ascensionMat[2]')>=1,true,'materials are unaffected by the new gear');
 assert.equal(ev('S.mapClears[11]'),true);
 ev('Math.random=window.savedRandom');
 // Stage 4 opens stage 5; auto-advance cannot create stage 6 on the final map.
 ev('S.adv=true;S.mp=11;S.lvl=4;S.prog[11]=4;S.kl=MPS-1;spawn();kill(mobs[0])');
 assert.equal(ev('S.lvl'),5);assert.equal(ev('S.prog[11]'),5);
 ev('spawn();kill(mobs.find(x=>x.boss))');assert.equal(ev('S.mp'),11);assert.equal(ev('S.lvl'),5);
 // Migration is based on the saved version, never on the defaults merged during load.
 const expected=[1,2,2,3,3,3,4,4,4,5];
 for(const m of [10,11])for(let old=1;old<=10;old++){
  ev(`S=fresh();S.cls='Rune Knight';S.lv=150;S.mapClears[9]=true;S.mapClears[10]=true;S.mp=${m};S.lvl=${old};S.prog[${m}]=${old};S.ascensionMat=[3,4,5];
   S.offlineIncome={rewardVersion:ASC_REWARD_VERSION,version:1,key:'Rune Knight:${m}:${old}',at:1,xp:3,zeny:4,job:2,kph:60};delete S.ascensionStageVersion;
   lsPut(saveKey(),JSON.stringify(S));S=load();`);
  assert.equal(ev('S.lvl'),expected[old-1]);assert.equal(ev(`S.prog[${m}]`),expected[old-1]);
  assert.equal(ev('S.offlineIncome.key'),`Rune Knight:${m}:${expected[old-1]}`);
  assert.equal(ev('S.mapClears[10]'),true);assert.equal(ev('S.ascensionMat.join()'),'3,4,5');
  ev('lsPut(saveKey(),JSON.stringify(S));S=load()');assert.equal(ev('S.lvl'),expected[old-1]);
 }
 ev("S.prog[11]=5;S.mp=11;S.lvl=5;mapM=11;mapL=5;mapSeason='ascension';");
 const html=ev('V.map()');assert.match(html,/5\/5 stages available/);assert.doesNotMatch(html,/Gear chance per kill|Every MVP drop is/);
 // The panel names the N+ weapon drops and still points at Forge materials and Ascension stats.
 assert.ok(html.includes('N+ weapons'),'the panel identifies its weapon-only N+ drops');
 assert.match(html,/Ascension materials/,'and still names the Forge materials');
 assert.match(html,/N\+ evolution/);assert.match(html,/Ascension stats/);
 console.log('PASS: ten fields, boss5/escorts, materials plus the map shelf online/offline, stage4→5, capped final route, twenty legacy migrations/idempotence, panel UI.');
}finally{game.close();}

// Access, save repair and balance use the real online spawn path.
const balance=createGame();
try{
 const {ev}=balance;
 ev('S=fresh();S.auto=false;S.adv=false;S.lv=149;S.mapClears.fill(true)');
 for(const m of [10,11])assert.equal(ev(`canTravel(${m},1)`),false);
 ev("S.cls='Rune Knight';S.lv=150;S.mapClears.fill(false)");
 for(const m of [10,11]){
  assert.equal(ev(`canTravel(${m},1)`),true);
  assert.equal(ev(`canTravel(${m},2)`),false); // Stages still earn their normal progress.
  ev(`S.mp=${m};S.lvl=1;currentUser='ascension-access';lsPut(saveKey(),JSON.stringify(S));S=load()`);
  assert.equal(ev('S.mp'),m);assert.equal(ev('S.lvl'),1);
 }
 ev('S.mp=9;S.lvl=15;spawn();window.anchor=mobs.find(x=>!x.boss)');
 const anchor=ev('({hp:window.anchor.hp,atk:window.anchor.atk})');
 // v172: HP and ATK ramps relative to the Nightmare Abyss REGULAR mob. The old MVP-anchored
 // ramps multiplied everything ~12x past playable (A1 one-shot a decent mythic GX at 1.05x pay).
 const hpScales={10:[2,3,4.5,6.5,9],11:[7,9,11,14,18]};
 const atkScales={10:[1.5,1.9,2.4,3,3.8],11:[4,4.8,5.6,6.6,8]};
 for(const m of [10,11]){
  let previous=0;
  for(let stage=1;stage<=5;stage++){
   ev(`S.mp=${m};S.lvl=${stage};spawn()`);
   const regular=ev('mobs.find(x=>!x.boss)');
   assert.equal(ev('mobs.every(x=>mhOf(x)===(x.boss?50:45))'),true,'Ascension boss HIT is 50; ordinary mobs and escorts retain 45');
   if(stage<5)assert.ok(regular.hp>previous);previous=regular.hp;
   const hpScale=hpScales[m][stage-1],atkScale=atkScales[m][stage-1];
   assert.equal(regular.hp,Math.floor(anchor.hp*hpScale*(stage===5?.5:1)),`map ${m} stage ${stage} HP; only stage-5 escorts are halved`);
   assert.equal(regular.max,regular.hp,'maximum HP matches current HP at spawn');
   assert.equal(regular.atk,Math.floor(anchor.atk*atkScale),`map ${m} stage ${stage} ATK`);
   assert.equal(ev(`ascensionCombatStats(${m},${stage},true).atk`),Math.floor(anchor.atk*atkScale*(m===11?2.25:3)),`map ${m} stage ${stage} boss ATK (Astral 3x / Thor 2.25x its mob)`);
   if(stage===1){
    console.log(`${ev('MAPS[S.mp].n')} entry: ${regular.hp} HP, ${regular.atk} ATK; ${(regular.hp/32000000).toFixed(2)}s at 32M DPS (HP only).`);
   }
   if(stage===5){
    const boss=ev('mobs.find(x=>x.boss)');
    assert.equal(boss.hp,Math.floor(anchor.hp*hpScales[m][4]*3),'stage boss retains its original HP after the escort reduction');
    assert.equal(boss.atk,Math.floor(anchor.atk*atkScales[m][4]*(m===11?2.25:3)),'stage boss uses its map-specific ATK multiplier');
   }
  }
 }
 ev("S.cls='Lord Knight';S.lv=150;S.mp=11;lsPut(saveKey(),JSON.stringify(S));S=load()");assert.equal(ev('S.mp'),9);
 console.log('PASS: independent fourth-job access without clears, reload/locked-save repair, stage-5 escort HP halved, unchanged ordinary/boss HP and ordinary ATK, Thor boss ATK reduced 25%, boss HIT50/ordinary HIT45.');
}finally{balance.close();}
