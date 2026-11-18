// Reward ownership across class changes and Novice resets (v422), against the real game.
//   node tools/tests/class_reward_ownership_sim.js
//
// The bugs being pinned (owner audit, 2026-11-18):
//   1. an offline claim paid the OLD class's measured rates into a newly switched class;
//   2. plaza EXP/Zeny/Job accrued-but-unpaid (and the fractional loot kill) crossed class changes;
//   3. a reset Novice reused an EARLIER Novice run's measured minute (same class name, new run).
// The rule: a reward belongs to (stable account id, class, progression-run generation) - never to
// the class name alone. A restored class continues its own run; every fresh start is a new run.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 ev(`S=fresh();currentUser='own-test';CLOUD.on=false;hubFirstPending=false;respawn=0;simPending=0;
  document.body.classList.remove('social-open');`);

 // ---- setup: the first Novice run measures a field minute -------------------
 ev(`farmSession=null;farmSample(1000);recordFarmIncome(600,300,420,10,31000);farmSample(61000);`);
 assert.equal(ev('S.offlineIncome&&S.offlineIncome.xp'),600,'a full field minute is measured');
 assert.equal(ev('S.offlineIncome.gen'),1,'the sample names the run that earned it');
 assert.ok(ev('Number.isSafeInteger(S.offlineIncome.aid)'),'and the account that earned it');

 // ---- bug 1: an offline claim must not pay the old class's rates into a new class ----
 ev(`S.jobs.Novice={jl:10,jx:0};changeClass('Swordman')`);
 assert.equal(ev('S.cls'),'Swordman');
 assert.equal(ev('S.runGen'),2,'a fresh class start is a new run');
 assert.equal(ev('S.offlineIncome&&S.offlineIncome.xp'),600,'the sample itself is kept for its owner');
 assert.equal(ev('plazaFarmIncome()'),null,'the plaza already refused (v421); the claim path is the bug');
 let r=ev(`(()=>{S.lv=50;S.offlineAt=Date.now()-8*3600000;S.offlineKph=600;S.offlineKillRemainder=0;
   window.__z=S.zeny;return applyOfflineProgress(Date.now())})()`);
 assert.equal(r.exp,0,'bug 1: the away claim pays the new class NO exp at the old class rate');
 assert.equal(r.zeny,0,'bug 1: and no zeny');
 assert.equal(r.kills,0,'bug 1: and replays none of the old class kills');
 assert.equal(ev('S.zeny-window.__z'),0,'the wallet is untouched');
 assert.equal(ev('S.offlineIncome.xp'),600,'the old class sample survives its own claim failing for us');

 // ---- bug 2: accrued-but-unpaid plaza rewards settle on the OUTGOING class ----
 ev(`S.jobs.Swordman={jl:5,jx:0};window.__exp0=expEarned;window.__zeny0=zenyEarned;
  plazaAfkAcc={t:.4,xp:37.6,zeny:12.4,job:5.9};plazaKillAcc.frac=.8;`);
 ev(`changeClass('Novice')`);
 assert.equal(ev('expEarned-window.__exp0'),37,'the outgoing class is paid the whole EXP it earned');
 assert.equal(ev('zenyEarned-window.__zeny0'),12,'and the whole Zeny');
 assert.equal(ev('S.jobs.Swordman.jx'),5,'and the whole Job EXP, into the class that earned it');
 assert.equal(ev('JSON.stringify(plazaAfkAcc)'),'{"t":0,"xp":0,"zeny":0,"job":0}','nothing pending crosses the change');
 assert.equal(ev('plazaKillAcc.frac'),0,'the fractional loot kill is dropped, not carried (it is <1 kill)');
 assert.equal(ev('S.runGen'),3,'the Novice restart is another new run');

 // ---- bug 3: a reset Novice must not reuse an earlier Novice run's sample ----
 assert.equal(ev('plazaFarmIncome()'),null,'bug 3: the first Novice run sample does not pay the reset Novice');
 r=ev(`(()=>{S.offlineAt=Date.now()-8*3600000;S.offlineKph=600;return applyOfflineProgress(Date.now())})()`);
 assert.equal(r.exp,0,'bug 3: and the away claim agrees');
 // the reset run measures its own minute and is paid at ITS OWN rate
 ev(`farmSession=null;farmSample(500000);recordFarmIncome(60,30,42,1,531000);farmSample(560000);`);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),60,'a fresh minute by the new run pays normally');

 // ---- legitimate restoration: a played class continues its own run ----
 ev(`changeClass('Swordman')`);                 // played before -> restores, run 2 again
 assert.equal(ev('S.runGen'),2,'a restored class continues the run it was left on');
 assert.equal(ev('plazaFarmIncome()'),null,'the Novice run sample is not the Swordman one');
 ev(`farmSession=null;farmSample(600000);recordFarmIncome(120,60,84,2,631000);farmSample(660000);`);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),120,'the Swordman run measures its own minute');
 ev(`changeClass('Novice')`);
 assert.equal(ev('plazaFarmIncome()'),null,'away from the owner: nothing');
 ev(`changeClass('Swordman')`);
 assert.equal(ev('S.runGen'),2,'back again: still the same run');
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),120,'and its own measured minute resumes - restoration is legitimate');

 // ---- account binding: the same class on a different account is a different owner ----
 ev(`S.accountId=7;farmSession=null;farmSample(700000);recordFarmIncome(90,45,63,1,731000);farmSample(760000);`);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),90,'stamped for account 7');
 ev(`S.accountId=9`);
 assert.equal(ev('plazaFarmIncome()'),null,'account 9 is not paid account 7 rates');
 ev(`S.accountId=7`);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),90,'and back');

 // ---- migration: a pre-ownership save is adopted, not wiped and not exploitably open ----
 ev(`(()=>{
  const legacy=JSON.parse(JSON.stringify(S));
  legacy.cls='Novice';delete legacy.runSeq;delete legacy.runGen;delete legacy.accountId;   // a pre-ownership guest save carries no account stamp (one would be judged by id alone)
  for(const k in legacy.base)delete legacy.base[k].gen;
  legacy.offlineIncome={version:1,key:'Novice:0:1',at:1000,xp:60,zeny:30,job:42,kph:60};   // no aid, no gen
  lsPut(saveKey(),JSON.stringify(legacy));
 })()`);
 ev(`S=load()`);
 assert.equal(ev('S.runGen'),1,'a legacy save joins run 1');
 assert.equal(ev('S.offlineIncome.gen'),1,'its same-class sample is adopted into that run');
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),60,'and keeps paying: migration erases nothing');
 ev(`S.jobs.Novice={jl:10,jx:0};changeClass('Swordman');changeClass('Novice')`);
 assert.equal(ev('S.runGen')>=2,true,'the restart after migration is a new run');
 assert.equal(ev('plazaFarmIncome()'),null,'and the adopted sample cannot leak into it');
 console.log('PASS reward ownership: claims, settlement, Novice reset, restoration, account binding, migration');
}finally{g.close()}
