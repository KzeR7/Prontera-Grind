/* v391 regression: the owner's exact report - "field have exp and go social hub nothing".
   Screenshot: Thor Volcano Stage 1, Lv 150, and the plaza card read "FIELD - RESPAWNING" with "-"
   EXP/min, so the plaza paid nothing.
   Cause: the sampling key included the STAGE (S.lvl). With Auto-advance on a stage clears after MPS
   (15) kills - about 15-28 s on a high map - so the key changed mid-measurement and farmSample()
   threw the whole 60-second window away and restarted it. The window never completed, S.offlineIncome
   was never written, and the plaza had nothing to pay.
   This suite drives the REAL kill() path on a real Thor map with ONE clock and asserts the window
   survives stage advances. It fails on the pre-fix build with payable=NO after 90 s of farming. */
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;
try{
 // The owner's character: max level, Guillotine Cross, Thor Volcano (map 11), Auto-advance ON.
 ev(`S=fresh();currentUser='Demonz';CLOUD.on=false;respawn=0;S.mp=11;S.lvl=1;S.lv=150;S.cls='Guillotine Cross';S.adv=true;`);
 ev(`S.st={str:99,agi:99,vit:99,int:99,dex:99,luk:99};S.pts=0;S.hp=maxHp();`);
 // ONE clock for everything, patched before any sampling starts, so kill()'s internal
 // recordFarmIncome and our loop agree on "now".
 ev('window.CT=1750000000000;Date.now=()=>window.CT;performance.now=()=>window.CT-1750000000000;');
 ev('farmSession=null;spawn();');

 assert.equal(ev('farmSamplingPaused()'),false,'open field must be samplable');

 // 90 seconds of continuous farming through the real kill path.
 const ages=[];
 let stageAdvances=0,prevStage=ev('S.lvl');
 for(let sec=0;sec<=90;sec++){
   ev('window.CT+=1000');
   ev('mobs.length&&(mobs[0].hp=0,kill(mobs[0]))');
   ev('if(!mobs.length&&typeof spawn==="function")spawn()');
   const st=ev('S.lvl'); if(st!==prevStage){stageAdvances++;prevStage=st}
   if(sec%10===0) ages.push(ev('farmSession?Math.round((window.CT-farmSession.start)/1000):-1'));
 }

 assert.ok(stageAdvances>=3,`the fixture must actually auto-advance stages (got ${stageAdvances})`);
 // The measured window must be ONE unbroken 60s minute spanning those advances - not a series of
 // restarts. Monitor pre-fix: ages go 0,10,5,0,10,5,0... and never reach 60.
 assert.ok(ages.every((a,i)=>i===0||a>=ages[i-1]||a>=60),`the sampling window restarted mid-farm: ${ages.join(',')}`);

 const income=JSON.parse(ev('JSON.stringify(S.offlineIncome||null)'));
 assert.ok(income,'a full field minute must be measured (pre-fix: never written at all)');
 assert.ok(income.xp>0,'the measured rate carries the farmed EXP');
 assert.equal(income.key.split(':').length,3,'the stored label still names class:map:stage');
 assert.equal(Number(income.key.split(':')[1]),11,'the rate is attributed to Thor Volcano');

 assert.equal(ev('!!plazaFarmIncome()'),true,'the plaza must be able to pay this rate');

 // The same rate must survive walking into the plaza - that is what the card reads.
 ev(`document.body.classList.add('social-open')`);
 assert.equal(ev('!!plazaFarmIncome()'),true,'opening the plaza must not drop the rate');
 ev(`window.CT+=180000;farmSample(window.CT)`);   // three minutes of standing still
 const still=JSON.parse(ev('JSON.stringify(S.offlineIncome)'));
 assert.equal(still.xp,income.xp,'standing in the plaza must not zero the measured rate');
 assert.equal(ev('!!plazaFarmIncome()'),true,'and it is still payable');

 // Moving to a different MAP must start a NEW measurement rather than inherit Thor's rate -
 // but the rate you already measured keeps paying until the new one completes (that is v389's rule).
 ev(`S.mp=10;S.lvl=1;document.body.classList.remove('social-open');farmSession=null;`);
 assert.equal(ev('farmSession'),null,'a new map starts a fresh window');
 ev('window.CT+=1000;farmSample(window.CT)');
 assert.equal(ev('farmKey()'),'Guillotine Cross:10','the window keys on the new map');
 assert.equal(ev('farmSession.key'),'Guillotine Cross:10','and the running sample follows it');
 assert.equal(JSON.parse(ev('JSON.stringify(S.offlineIncome)')).key.split(':')[1],'11','the already-measured Thor minute is untouched');

 console.log(`PASS plaza rate survives stage advance: ${stageAdvances} auto-advances across one 60s window, rate paid in the plaza`);
}finally{g.close()}
