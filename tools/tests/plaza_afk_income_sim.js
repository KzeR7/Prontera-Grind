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
 // v392 (owner: "do it by awaiting connection"): a LOST connection no longer stops the plaza paying -
// the rate was measured before the drop and is capped by that measurement, so replaying it cannot
// inflate it. What still stops the plaza is the server refusing writes (gate) or a maintenance pause.
ev("window.__before=expEarned;CLOUD.lost=true;plazaAfkTick(60)");
assert.ok(ev('expEarned-window.__before')>=600,'a lost connection keeps the plaza earning (was "pays nothing" before v392)');
ev('CLOUD.lost=false;window.__b2=expEarned;CLOUD.gate=true;plazaAfkTick(60)');
assert.equal(ev('expEarned-window.__b2'),0,'a write gate still pays nothing: the number would not be trusted on reconnect');
ev('CLOUD.gate=false');
 ev(`document.body.classList.remove('social-open');hubFirstPending=false;respawn=0;
 offlineRateSample(362000);recordFarmIncome(120,60,42,1,392000);farmSample(421999);`);
 assert.equal(ev('S.offlineIncome.xp'),600,'resuming requires a fresh full field minute');
 ev('farmSample(422000)');assert.equal(ev('S.offlineIncome.xp'),120);
 ev('S.offlineIncome={...S.offlineIncome,xp:0,zeny:0,job:0};');assert.equal(ev('plazaFarmIncome()'),null,'zeroed saves are not advertised as earning');
 ev('S.offlineIncome=null');assert.equal(ev('plazaFarmIncome()'),null,'new accounts never get fabricated rates');
 // v421 (class-switch exploit): a measured minute belongs to the class that earned it. The check
 // used to accept any valid class name in the sample key, so after changeClass() the plaza kept
 // paying the old class rate to the new class.
 ev(`S.offlineIncome={version:1,rewardVersion:ASC_REWARD_VERSION,key:farmStageKey(),at:422000,xp:600,zeny:300,job:420,kph:600};`);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),600,'the measuring class still earns its own minute');
 ev(`S.jobs.Novice={jl:10,jx:0};changeClass('Swordman')`);
 assert.equal(ev('S.cls'),'Swordman','the class change itself happened');
 assert.equal(ev('S.offlineIncome&&S.offlineIncome.xp'),600,'the stored sample survives for the documented away claim');
 assert.equal(ev('plazaFarmIncome()'),null,'the plaza refuses the old class rate after a class switch');
 ev('window.__x=expEarned;window.__z=zenyEarned;window.__j=0;const __aj=addJob;addJob=x=>{window.__j+=x;__aj(x)};plazaAfkAcc={t:0,xp:0,zeny:0,job:0};plazaKillAcc.kills=0;plazaAfkTick(60)');
 assert.equal(ev('expEarned-window.__x'),0,'no EXP leaks to the new class');
 assert.equal(ev('zenyEarned-window.__z'),0,'no Zeny leaks to the new class');
 assert.equal(ev('window.__j'),0,'no Job EXP leaks to the new class');
 assert.equal(ev('plazaKillAcc.kills'),0,'no loot kills replay for the new class');
 ev(`changeClass('Novice')`);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),600,'switching back resumes the class own measured minute');
 ev(`changeClass('Swordman');farmSession=null;farmSample(500000);recordFarmIncome(120,60,42,1,531000);farmSample(560000);`);
 assert.equal(ev('String(S.offlineIncome.key).split(":")[0]'),'Swordman','a full field minute by the new class replaces the stored sample');
 assert.equal(ev('S.offlineIncome.xp'),120);
 assert.equal(ev('plazaFarmIncome()&&plazaFarmIncome().xp'),120,'the plaza pays the new class its own measured rate');
 ev(`changeClass('Novice')`);
 assert.equal(ev('plazaFarmIncome()'),null,'the replaced sample no longer pays the class that left it behind');
 // v423: generic saves invoke this checkpoint rather than settlement. At a deliberately high rate
 // every 0.1 s contains whole rewards plus a residue: a checkpoint after every tick must converge
 // exactly to one checkpoint at the end, while preserving the unfinished loot-kill fraction. The
 // real save/update integration is covered in fishing_save_reload_sim.mjs (this game helper stubs
 // save itself so combat behavior tests cannot write browser storage).
 ev(`window.__plazaCheckpointRun=frequent=>{
   S=fresh();currentUser='plaza-test';CLOUD.on=false;CLOUD.gate=false;CLOUD.paused=false;CLOUD.updating=false;hubFirstPending=false;respawn=1e9;
   document.body.classList.add('social-open');S.mp=0;S.lvl=1;
   S.offlineIncome={version:1,rewardVersion:ASC_REWARD_VERSION,key:'Novice:0:1',at:1,aid:rewardAccountId(),gen:rewardRunGen(),xp:600005,zeny:300007,job:60011,kph:0};
   plazaAfkAcc={t:0,xp:0,zeny:0,job:0};plazaKillAcc.frac=.73;window.__job=0;
   const realAdd=addJob;addJob=x=>{window.__job+=x;realAdd(x)};
   for(let i=0;i<5;i++){plazaAfkTick(.1);if(frequent)checkpointPlazaAfk()}
   if(!frequent)checkpointPlazaAfk();addJob=realAdd;
   return JSON.stringify({lv:S.lv,exp:S.exp,zeny:S.zeny,jx:S.jobs.Novice.jx,job:window.__job,acc:plazaAfkAcc,loot:plazaKillAcc.frac});
 };`);
 const frequent=JSON.parse(ev('__plazaCheckpointRun(true)')),single=JSON.parse(ev('__plazaCheckpointRun(false)'));
 const {acc:frequentAcc,...frequentWhole}=frequent,{acc:singleAcc,...singleWhole}=single;
 assert.deepEqual(frequentWhole,singleWhole,'ordinary checkpoint frequency leaves every whole Plaza reward identical');
 for(const k of['t','xp','zeny','job'])assert.ok(Math.abs(frequentAcc[k]-singleAcc[k])<1e-9,
   'ordinary checkpoint frequency preserves the '+k+' residual apart from IEEE rounding noise');
 assert.equal(frequent.loot,.73,'ordinary checkpoints retain a partial loot kill');
 assert.ok(frequent.zeny>=2500,'a sub-second high-rate interval writes whole Zeny at its checkpoint');
 console.log('PASS Plaza AFK: hub autosave preservation, direct login rewards, single-count income, pause and fresh field sampling, class-switch rate refusal, save-frequency checkpointing');
}finally{g.close()}
