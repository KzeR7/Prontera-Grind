const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 ev(`S=fresh();currentUser='plaza-test';hubFirstPending=false;CLOUD.on=false;
 farmSession=null;farmSample(1000);recordFarmIncome(600,300,420,10,31000);farmSample(61000);
 S.offlineKph=600;S.offlineRateAt=61000;S.offlineRateKills=S.kills;
 window.savedIncome=JSON.stringify(S.offlineIncome);
 document.body.classList.add('social-open');hubFirstPending=true;respawn=1e9;`);
 for(let now=66000;now<=361000;now+=5000)ev(`offlineRateSample(${now})`);
 assert.equal(ev('JSON.stringify(S.offlineIncome)'),ev('savedIncome'),'hub autosaves preserve the measured rate for five minutes');
 assert.equal(ev('S.offlineKph'),600,'hub autosaves preserve offline kill rate');
 ev('S.lv=150;expEarned=0;zenyEarned=0;window.beforeExp=S.exp;window.beforeZeny=S.zeny;window.jobPaid=0;const realAddJob=addJob;addJob=x=>{window.jobPaid+=x;realAddJob(x)};plazaAfkAcc={t:0,xp:0,zeny:0,job:0};');
 for(let i=0;i<600;i++)ev('simSteps(.1)');
 assert.equal(ev('S.exp-beforeExp'),600,'direct hub login pays measured EXP without field combat');
 assert.equal(ev('S.zeny-beforeZeny'),300);
 assert.equal(ev('jobPaid'),420);
 assert.equal(ev('expEarned'),600,'gross EXP is counted once');
 assert.equal(ev('zenyEarned'),300,'gross Zeny is counted once');
 assert.equal(ev('JSON.stringify(S.offlineIncome)'),ev('savedIncome'),'AFK rewards never train their own rate');
 ev("CLOUD.lost=true;plazaAfkTick(60)");assert.equal(ev('expEarned'),600,'connection loss pays nothing');ev('CLOUD.lost=false');
 ev(`document.body.classList.remove('social-open');hubFirstPending=false;respawn=0;
 offlineRateSample(362000);recordFarmIncome(120,60,42,1,392000);farmSample(421999);`);
 assert.equal(ev('S.offlineIncome.xp'),600,'resuming requires a fresh full field minute');
 ev('farmSample(422000)');assert.equal(ev('S.offlineIncome.xp'),120);
 ev('S.offlineIncome={...S.offlineIncome,xp:0,zeny:0,job:0};');assert.equal(ev('plazaFarmIncome()'),null,'zeroed saves are not advertised as earning');
 ev('S.offlineIncome=null');assert.equal(ev('plazaFarmIncome()'),null,'new accounts never get fabricated rates');
 console.log('PASS Plaza AFK: hub autosave preservation, direct login rewards, single-count income, pause and fresh field sampling');
}finally{g.close()}
