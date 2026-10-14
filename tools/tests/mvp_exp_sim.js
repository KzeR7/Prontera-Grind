// Real spawn, kill, saved farming sample and away payout; no reward-function stubs.
const assert=require('node:assert/strict');
const {createGame}=require('./helpers/game');
const g=createGame(),ev=g.ev;let passed=0;
const read=code=>JSON.parse(ev(`JSON.stringify(${code})`));
function test(name,fn){ev('S=fresh();farmSession=null;CLOUD.on=false;PAGE_BOOT_AT=Date.now();resetSkillRuntime()');fn();passed++;console.log('  ok '+name)}
try{
 test('every map keeps normal/early Nightmare pay and exactly preserves its NM5 wave budget',()=>{
  for(let map=0;map<10;map++)for(let stage=1;stage<=15;stage++){
   const r=read(`(()=>{
    S.mp=${map};S.lvl=${stage};S.lv=150;S.adv=false;S.pets=[];S.q=null;spawn();
    const l=pw(),scale=S.lvl>10?nmPayOf(S.mp,S.lvl,1.5):1;
    const oldMob=Math.max(1,Math.floor(EXPK*Math.pow(l,1.5)/50*(S.lvl>10?nmExpOf(S.lvl)*scale:1)));
    const oldBoss=Math.max(1,Math.floor(BOSEK*Math.pow(l,1.5)/50*(S.lvl>10?NMEXP*scale:1)));
    const escorts=mobs.filter(m=>!m.boss),boss=mobs.find(m=>m.boss);
    const mob=escorts[0];const paid=x=>Math.round(x*expRate());
    return {oldMob,oldBoss,mob:mob.exp,boss:boss?.exp,count:escorts.length,
      wave:mobs.reduce((n,m)=>n+m.exp,0),paidWave:mobs.reduce((n,m)=>n+paid(m.exp),0),
      oldPaidWave:paid(oldBoss)+escorts.length*paid(oldMob),rate:expRate()};
   })()`);
   if(stage!==15){assert.equal(r.mob,r.oldMob,`map ${map} stage ${stage}`);if(stage===10)assert.equal(r.boss,r.oldBoss);}
   else{
    assert.equal(r.count,map<5?3:5);assert.ok(r.boss>=1.25*r.mob);
    assert.equal(r.wave,r.oldBoss+r.count*r.oldMob,'whole wave raw EXP unchanged');
    assert.ok(Math.abs(r.paidWave-r.oldPaidWave)<=r.count+1,'only per-kill rounding can change paid EXP');
   }
   if(stage===10)assert.ok(r.boss>r.mob);
  }
 });
 test('online and offline boss/escort EXP and Zeny agree on all boss fields',()=>{
  for(let map=0;map<10;map++)for(const stage of [10,15]){
   const r=read(`(()=>{
    S.mp=${map};S.lvl=${stage};S.lv=150;S.q=null;S.pets=[];S.adv=false;
    const random=Math.random;try{Math.random=()=>0;spawn();
     const boss=mobs.find(m=>m.boss),escort=mobs.find(m=>!m.boss),awayBoss=offlineMobForCurrentField();
     Math.random=()=>.99;const awayEscort=offlineMobForCurrentField();
     const initial=S.exp;kill(boss);
     return {boss:[boss.exp,boss.zeny],escort:[escort.exp,escort.zeny],awayBoss:[awayBoss.exp,awayBoss.zeny],awayEscort:[awayEscort.exp,awayEscort.zeny],paid:S.exp-initial,expected:Math.round(boss.exp*expRate())};
    }finally{Math.random=random}
   })()`);
   // Zeny RNG must be identical for the escort comparison too.
   assert.deepEqual(r.awayBoss,r.boss);assert.equal(r.awayEscort[0],r.escort[0]);assert.equal(r.paid,r.expected);
   assert.equal(ev(`(()=>{const random=Math.random;try{Math.random=()=>0;return offlineMobForCurrentField(${map},${stage}).zeny}finally{Math.random=random}})()`),r.boss[1]);
   const z=ev(`(()=>{const random=Math.random;try{Math.random=()=>.99;spawn();return mobs.find(m=>!m.boss).zeny}finally{Math.random=random}})()`);
   assert.equal(r.awayEscort[1],z);
  }
 });
 test('a real NM5 farming minute pays half its measured EXP offline without a second boss multiplier',()=>{
  for(const roll of [0,.99]){
   const r=read(`(()=>{
    S=fresh();S.lv=150;S.mp=9;S.lvl=15;S.q=null;S.pets=[];S.adv=false;farmSession=null;
    const random=Math.random,date=Date.now,start=date()-7200000;
    try{Math.random=()=>${roll};Date.now=()=>start;offlineRateSample(start);
     Date.now=()=>start+59000;spawn();const wave=mobs.slice().sort((a,b)=>Number(a.boss)-Number(b.boss));const initial=S.exp;for(const m of wave)kill(m);
     Date.now=()=>start+60000;offlineRateSample(Date.now());const income={...S.offlineIncome};S.offlineAt=Date.now();
     const paidOnline=S.exp-initial;Date.now=()=>start+3660000;const award=applyOfflineProgress(Date.now());
     return {paidOnline,income,exp:award.exp,kills:award.kills,stages:award.stages,map:S.mp,stage:S.lvl};
    }finally{Math.random=random;Date.now=date}
   })()`);
   assert.equal(r.income.xp,r.paidOnline);assert.equal(r.exp,30*r.paidOnline);
   assert.equal(r.kills,180);assert.deepEqual([r.stages,r.map,r.stage],[0,9,15]);
  }
 });
 test('old saved sample remains usable and a fresh minute replaces it without re-scaling',()=>{
  const r=read(`(()=>{const now=Date.now()-7200000;S.lv=150;S.offlineAt=now;S.offlineKph=0;
   S.offlineIncome={version:1,key:'Novice:9:15',at:now,xp:1000,zeny:20,job:0,kph:0};
   const first=applyOfflineProgress(now+3600000);recordFarmIncome(120,4,0,1,now+3600001);recordFarmIncome(240,8,0,1,now+3660000);farmSample(now+3660001);
   return {paid:first.exp,source:first.incomeSource,sample:S.offlineIncome};})()`);
  assert.equal(r.paid,30000);assert.match(r.source,/Abyss/);assert.equal(r.sample.key,'Novice:0:1');assert.equal(r.sample.xp,240);
 });
 test('cloud claim uses server time, applies EXP once, and missing sample awards no income',()=>{
  const r=read(`(()=>{const now=Date.now();S.lv=150;S.offlineAt=now-8*3600000;S.offlineKph=0;
   S.offlineIncome={version:1,key:'Novice:9:15',at:S.offlineAt,xp:1000,zeny:0,job:0,kph:0};CLOUD.on=true;
   const claim={id:101,awayMs:8*3600000,creditedMs:4*3600000,kills:0,remainder:0,rateKph:0};
   const first=applyOfflineProgress(now,claim),second=applyOfflineProgress(now+3600000,claim);
   S.offlineAt=now;S.offlineIncome=null;const missing=applyOfflineProgress(now+3600000,{...claim,id:102,awayMs:3600000,creditedMs:3600000});
   return {first:first.exp,second:second.alreadyApplied,missing:missing.exp,total:S.exp};})()`);
  assert.deepEqual(r,{first:120000,second:true,missing:0,total:120000});
 });
 console.log(`MVP EXP: ${passed} passed`);
}finally{g.close()}
